// PayMongo needs an https success/cancel URL. This tiny endpoint is that
// URL, and its only job is to bounce the browser to verifast:// so
// WebBrowser.openAuthSessionAsync (already used for Google sign-in) can
// catch the return and close the in-app browser.
Deno.serve((req) => {
  const result = new URL(req.url).searchParams.get("result") ?? "cancel";
  return Response.redirect(`verifast://subscription?checkout=${result}`, 302);
});
