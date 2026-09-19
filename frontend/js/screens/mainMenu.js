const ITEMS = [
  { label: 'Market Prices', to: 'MarketPrices' },
  { label: 'Sell / Buy', to: 'ComingSoon' },
  { label: 'Farmer Circle', to: 'ComingSoon' },
  { label: 'Ask AI', to: 'AskAIHome' },
  { label: 'Daily Tasks', to: 'ComingSoon' },
  { label: 'Weather', to: 'Weather' },
];

export default {
  name: 'MainMenu',
  title: 'AgriLink',
  numericSelect: true,
  softLeft: { label: '', handler() {} },
  render() {
    const list = document.createElement('div');
    list.className = 'list';
    ITEMS.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'item';
      row.textContent = `${i + 1}  ${it.label}`;
      list.appendChild(row);
    });
    return list;
  },
  onEnter(_el, ctx, i) {
    const it = ITEMS[i];
    ctx.router.push(it.to, { title: it.label });
  },
};
