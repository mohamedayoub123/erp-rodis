// Page de test du navigateur, sans connexion et sans Tailwind : elle doit s'afficher meme sur un
// vieux Safari/Chrome (iPad ancien) pour dire si l'ERP peut s'y afficher correctement.
// N'affiche que ce que le navigateur sait de lui-meme : aucune donnee de l'ERP.
export const dynamic = "force-dynamic";

const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Test du navigateur - ERP Rodis</title>
<style>
body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;padding:16px;background:#f8fafc;color:#0f172a}
h1{font-size:22px;margin:0 0 12px}
.verdict{padding:18px;border-radius:12px;font-size:20px;font-weight:bold;margin:12px 0;color:#fff;background:#64748b}
.ok{background:#15803d}.ko{background:#b91c1c}
table{border-collapse:collapse;width:100%;background:#fff}
td{border:1px solid #cbd5e1;padding:10px;font-size:17px}
td.r{width:70px;text-align:center;font-weight:bold}
.oui{color:#15803d}.non{color:#b91c1c}
pre{white-space:pre-wrap;word-break:break-all;background:#fff;border:1px solid #cbd5e1;padding:10px;font-size:14px}
</style>
</head>
<body>
<h1>Test du navigateur</h1>
<div id="verdict" class="verdict">Test en cours...</div>
<table id="tests"></table>
<p><b>Version du navigateur :</b> <span id="version">?</span></p>
<p><b>Identifiant complet (a envoyer en photo) :</b></p>
<pre id="ua"></pre>
<script>
(function () {
  var ua = navigator.userAgent || "";
  document.getElementById("ua").textContent = ua;
  var m = ua.match(/Version\\/(\\d+)[._](\\d+)/) || ua.match(/OS (\\d+)[_.](\\d+)/) || ua.match(/Chrome\\/(\\d+)/);
  document.getElementById("version").textContent = m ? m[0] : "inconnue";

  function supporte(prop, valeur) {
    try { return !!(window.CSS && CSS.supports && CSS.supports(prop, valeur)); } catch (e) { return false; }
  }
  function couches() {
    try {
      var s = document.createElement("style");
      s.textContent = "@layer a{#_t_{width:7px}}";
      document.head.appendChild(s);
      var d = document.createElement("div");
      d.id = "_t_";
      document.body.appendChild(d);
      var ok = d.offsetWidth === 7;
      document.body.removeChild(d);
      document.head.removeChild(s);
      return ok;
    } catch (e) { return false; }
  }
  var tests = [
    ["Couches CSS (@layer)", couches(), true],
    ["Proprietes @property", !!(window.CSS && CSS.registerProperty), true],
    ["Melange de couleurs (color-mix)", supporte("color", "color-mix(in srgb, red, blue)"), true],
    ["Couleurs modernes (oklch)", supporte("color", "oklch(0.5 0.1 100)"), true],
    ["Selecteur :where()", !!(window.CSS && CSS.supports && CSS.supports("selector(:where(a))")), false],
    ["Proportions (aspect-ratio)", supporte("aspect-ratio", "1 / 1"), false]
  ];
  var html = "", bloquant = false;
  for (var i = 0; i < tests.length; i++) {
    html += "<tr><td>" + tests[i][0] + "</td><td class='r " + (tests[i][1] ? "oui'>OUI" : "non'>NON") + "</td></tr>";
    if (tests[i][2] && !tests[i][1]) bloquant = true;
  }
  document.getElementById("tests").innerHTML = html;
  var v = document.getElementById("verdict");
  if (bloquant) {
    v.className = "verdict ko";
    v.textContent = "Navigateur trop ancien : l'ERP s'affichera mal. Envoie-moi une photo de cette page.";
  } else {
    v.className = "verdict ok";
    v.textContent = "Navigateur compatible : le probleme vient d'autre chose. Envoie-moi une photo de cette page.";
  }
})();
</script>
</body>
</html>`;

export async function GET() {
  return new Response(PAGE, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
