/**
 * BOS Paper Co. â Supabase Order Integration
 * Detects order generation via MutationObserver on #orderResult,
 * parses cart items from DOM, and saves orders to Supabase.
 */

(function() {
  var SUPABASE_URL = "https://agbxkuaedwallthbpphe.supabase.co";
  var SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFnYnhrdWFlZHdhbGx0aGJwcGhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NjkzNzYsImV4cCI6MjA5MTM0NTM3Nn0.qlLE8cYxAVV09yKnyJtC1ShosJPL70ISPugrEFQp1jQ";
  var WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwKrrzepBq5XTxuEJCcHKkYCACWlWxBt2ftkYM3yxPTTXyTAEAyPIFN5MmuAszNgMqV3A/exec";
  var MAX_RETRIES = 5;
  var RETRY_DELAY_MS = 1000;

  var supabaseClient = null;
  var orderProcessed = false;

  /**
   * Initialize Supabase client using existing window.supabase or load dynamically
   */
  function initSupabase() {
    return new Promise(function(resolve, reject) {
      // Try to use existing window.supabase if available
      if (window.supabase && window.supabase.createClient) {
        try {
          supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
          console.log('[Supabase] Using existing window.supabase');
          resolve(supabaseClient);
          return;
        } catch (e) {
          console.warn('[Supabase] Failed to use window.supabase:', e);
        }
      }

      // Load Supabase library dynamically
      var attempts = 0;

      function checkSupabase() {
        if (window.supabase && window.supabase.createClient) {
          try {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            console.log('[Supabase] Library loaded and client created');
            resolve(supabaseClient);
            return;
          } catch (e) {
            console.error('[Supabase] Failed to create client:', e);
            reject(e);
            return;
          }
        }

        attempts++;
        if (attempts >= MAX_RETRIES) {
          reject(new Error('Supabase library failed to load after ' + MAX_RETRIES + ' attempts'));
          return;
        }

        setTimeout(checkSupabase, RETRY_DELAY_MS);
      }

      // Check if library is already loaded
      if (window.supabase && window.supabase.createClient) {
        checkSupabase();
        return;
      }

      // Load the library
      var script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = function() {
        console.log('[Supabase] Script loaded, checking for window.supabase');
        setTimeout(checkSupabase, 100);
      };
      script.onerror = function() {
        reject(new Error('Failed to load Supabase library'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Parse cart items from DOM elements with class 'cart-item'
   * Expected format: product name, then "X unit Â· $price" pattern
   */
  function parseCartItemsFromDOM() {
    var items = [];
    var cartElements = document.querySelectorAll('.cart-item');

    cartElements.forEach(function(el) {
      var text = el.textContent || '';
      var lines = text.split('\n').map(function(line) {
        return line.trim();
      }).filter(function(line) {
        return line.length > 0;
      });

      if (lines.length >= 2) {
        // First line is the product name
        var name = lines[0];
        // Second line contains quantity and price like "1 case Â· $25.00"
        var quantityAndPrice = lines[1];

        // Parse quantity (e.g., "1 case" -> 1)
        var quantityMatch = quantityAndPrice.match(/^(\d+)/);
        var quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;

        // Parse price (e.g., "$25.00" -> 25.00)
        var priceMatch = quantityAndPrice.match(/\$[\d,.]+/);
        var price = priceMatch ? parseFloat(priceMatch[0].replace('$', '').replace(/,/g, '')) : 0;

        items.push({
          name: name,
          quantity: quantity,
          price: price,
          unit: quantityAndPrice.indexOf('case') >= 0 ? 'case' : 'unit'
        });
      }
    });

    return items;
  }

  /**
   * Extract restaurant name from #custName element
   */
  function getRestaurantName() {
    var custNameEl = document.getElementById('custName');
    return custNameEl ? (custNameEl.value || custNameEl.textContent || '').trim() : '';
  }

  /**
   * Extract phone from #custPhone element
   */
  function getPhone() {
    var custPhoneEl = document.getElementById('custPhone');
    return custPhoneEl ? (custPhoneEl.value || custPhoneEl.textContent || '').trim() : '';
  }

  /**
   * Extract delivery type from radio input[name="del"]:checked
   */
  function getDeliveryType() {
    var selectedRadio = document.querySelector('input[name="del"]:checked');
    return selectedRadio ? selectedRadio.value : 'standard';
  }

  /**
   * Send webhook notification to Google Apps Script
   */
  function sendWebhookNotification(orderData) {
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
      mode: 'no-cors'
    }).catch(function(error) {
      console.error('[Webhook] Error sending notification:', error);
    });
  }

  /**
   * Save order to Supabase
   */
  function saveOrderToSupabase(orderData) {
    return new Promise(function(resolve) {
      initSupabase()
        .then(function(client) {
          return client
            .from('orders')
            .insert([
              {
                ref: orderData.ref || 'UNKNOWN',
                restaurant: orderData.restaurant,
                employee: orderData.employee || '',
                phone: orderData.phone,
                items: orderData.items,
                delivery_type: orderData.delivery_type,
                notes: orderData.notes || '',
                status: 'pending',
                created_at: new Date().toISOString()
              }
            ]);
        })
        .then(function(res) {
          if (res.error) {
            console.error('[Supabase] Insert error:', res.error.message);
            resolve(false);
          } else {
            console.log('[Supabase] Order saved successfully:', orderData.ref);
            resolve(true);
          }
        })
        .catch(function(error) {
          console.error('[Supabase] Save error:', error);
          resolve(false);
        });
    });
  }

  /**
   * Process order when orderResult element becomes visible
   */
  function processOrder() {
    if (orderProcessed) {
      return;
    }
    orderProcessed = true;

    console.log('[Orders] Processing order from DOM...');

    // Parse data from DOM
    var items = parseCartItemsFromDOM();
    var restaurant = getRestaurantName();
    var phone = getPhone();
    var deliveryType = getDeliveryType();

    // Generate a reference number
    var ref = 'BOS-' + Math.random().toString(36).substring(2, 7).toUpperCase();

    if (items.length === 0) {
      console.warn('[Orders] No cart items found in DOM');
      return;
    }

    var orderData = {
      ref: ref,
      restaurant: restaurant || '(no name)',
      phone: phone || '(no phone)',
      items: items,
      delivery_type: deliveryType,
      employee: '',
      notes: 'Order processed at ' + new Date().toLocaleString()
    };

    console.log('[Orders] Order data:', orderData);

    // Save to Supabase
    saveOrderToSupabase(orderData).then(function(saved) {
      if (saved) {
        // Add visual confirmation tag
        var resultEl = document.getElementById('orderResult');
        if (resultEl && !resultEl.querySelector('.sb-ref-tag')) {
          var tag = document.createElement('div');
          tag.className = 'sb-ref-tag';
          tag.style.cssText = 'text-align:center;padding:10px;margin:8px 0;background:#e8f5e9;border-radius:8px;font-weight:600;font-size:14px;color:#2e7d32;';
          tag.textContent = '\u2705 Order ' + ref + ' saved!';
          resultEl.insertBefore(tag, resultEl.firstChild);
        }

        // Send webhook notification
        sendWebhookNotification(orderData);
      }
    });
  }

  /**
   * Set up MutationObserver on #orderResult
   */
  function setupOrderObserver() {
    var orderResultEl = document.getElementById('orderResult');

    if (!orderResultEl) {
      console.warn('[Orders] #orderResult element not found');
      return;
    }

    var observer = new MutationObserver(function() {
      var isVisible = orderResultEl.style.display !== 'none' &&
                      orderResultEl.offsetParent !== null;

      if (isVisible) {
        console.log('[Orders] #orderResult became visible, processing order...');
        observer.disconnect();
        processOrder();
      }
    });

    // Watch for style changes and class changes
    observer.observe(orderResultEl, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      subtree: false
    });

    console.log('[Orders] MutationObserver set up on #orderResult');
  }

  /**
   * Initialize on document ready
   */
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setupOrderObserver);
    } else {
      setupOrderObserver();
    }
  }

  // Start initialization
  init();
})();
