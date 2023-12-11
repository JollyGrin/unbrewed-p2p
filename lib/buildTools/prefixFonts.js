const fs = require("fs");
const path = require("path");

// Set the base URL for your CSS files
const cssUrl = "/static/css/";
// Set the directory where your HTML files are located
const htmlDir = path.join(__dirname, `../../.next${cssUrl}`);

// Set the base URL for your fonts
const fontsUrl = "/unbrewed-p2p/fonts/";

// Loop through all HTML files in the directory
fs.readdirSync(htmlDir).forEach((file) => {
  console.info("FILE:", file);
  if (file.endsWith(".css")) {
    const filePath = path.join(htmlDir, file);
    let html = fs.readFileSync(filePath, "utf8");

    // Find the CSS file name
    const cssFile = fs
      .readdirSync(".next/static/css")
      .find((file) => file.endsWith(".css"));

    console.info("FOUND:", cssFile);
    const fontPatternRegex = /src:\s*url\(["']?\/fonts\//;

    html = html.replace(fontPatternRegex, `src: url(${fontsUrl}`);
    html = html.replace(fontPatternRegex, `src: url(${fontsUrl}`);
    html = html.replace(fontPatternRegex, `src: url(${fontsUrl}`);

    // Write the updated HTML file back to disk
    fs.writeFileSync(filePath, html);
  }
});
