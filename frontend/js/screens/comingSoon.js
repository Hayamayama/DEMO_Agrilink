export default {
  name: 'ComingSoon',
  title: 'AgriLink',
  render(ctx) {
    const d = document.createElement('div');
    d.className = 'msg';
    d.textContent = `${ctx.params?.title || 'This module'} is coming soon.`;
    return d;
  },
};
