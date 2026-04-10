/*  BOS Paper Co. — Supabase Order Integration
    Hooks into the existing generateOrder() to save orders to Supabase.
    Drop this file in the repo root alongside index.html.            */

(function() {
  var SUPABASE_URL = "https://agbxkuaedwallthbpphe.supabase.co";
  var SUPABASE_KEY = "sb_publishable_11fEmR1b5UCmH6xQipclfA_Sya9fAc4";
  var _sb;

  // Load Supabase client library dynamically
  var script = document.createElement('script');
  script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
  script.onload = function() {
    _sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    hookGenerateOrder();
  };
  document.head.appendChild(script);

  function hookGenerateOrder() {
    var original = window.generateOrder;
    if (!original) return;

    window.generateOrder = function() {
      // Run the original function first
      original.apply(this, arguments);

      // If order result is visible, it means order was generated successfully
      var resultEl = document.getElementById('orderResult');
      if (!resultEl || resultEl.style.display === 'none') return;

      // Gather order data from the form
      var name = (document.getElementById('custName').value || '').trim() || '(no name)';
      var phone = (document.getElementById('custPhone').value || '').trim() || '(no phone)';
      var notes = (document.getElementById('orderNotes').value || '').trim();
      var delRadio = document.querySelector('input[name="del"]:checked');
      var delType = delRadio ? delRadio.value : 'std';

      // Build items array from cart (window.cart is set by the existing portal)
      var cart = window.cart || {};
      var items = Object.entries(cart).filter(function(e) { return e[1] > 0; });
      if (items.length === 0) return;

      var orderItems = items.map(function(e) {
        var id = Number(e[0]), qty = e[1];
        var p = window.getProduct ? window.getProduct(id) : {id: id, name: 'Item ' + id};
        return {id: p.id, name: p.name, qty: qty, price: p.price || null};
      });

      // Generate unique ref
      var ref = 'BOS-' + Math.random().toString(36).substring(2, 7).toUpperCase();

      // Save to Supabase
      _sb.from('orders').insert({
        ref: ref,
        restaurant: name,
        employee: name,
        phone: phone,
        items: orderItems,
        delivery_type: delType === 'emer' ? 'emergency' : 'standard',
        notes: notes || null,
        status: 'new'
      }).then(function(res) {
        if (res.error) {
          console.error('Supabase save failed:', res.error.message);
        } else {
          console.log('Order saved to Supabase:', ref);
          // Show ref tag on the order result
          if (!resultEl.querySelector('.sb-ref-tag')) {
            var tag = document.createElement('div');
            tag.className = 'sb-ref-tag';
            tag.style.cssText = 'text-align:center;padding:10px;margin:8px 0;background:#e8f5e9;border-radius:8px;font-weight:600;font-size:14px;color:#2e7d32;';
            tag.textContent = '\u2705 Order ' + ref + ' saved!';
            resultEl.insertBefore(tag, resultEl.firstChild);
          }
        }
      });
    };
  }
})();
