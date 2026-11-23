const params = new URLSearchParams(location.search);
if (location.pathname === '/' &&
    (params.has('action') || params.has('tab') || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true)) {
  location.replace('/app/' + location.search + location.hash);
}
