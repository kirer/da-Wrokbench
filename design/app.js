/* 设计稿交互：仅主题切换 + 轻量 tab 高亮，供评审时看浅/深两套。 */
(function () {
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }
  document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') || 'dark';
      apply(cur === 'dark' ? 'light' : 'dark');
    });
  });
  // 视觉 tab 切换（仅切换 active 类，不切内容）
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    group.querySelectorAll('.tab, .rp-tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        group.querySelectorAll('.tab, .rp-tab').forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
      });
    });
  });
})();

/* 整行可点：给 <tr data-href="..."> 增加点击跳转 */
(function () {
  document.querySelectorAll('[data-href]').forEach(function (el) {
    el.style.cursor = 'pointer';
    el.addEventListener('click', function (e) {
      if (e.target.closest('a, button')) return;
      window.location.href = el.getAttribute('data-href');
    });
  });
})();
