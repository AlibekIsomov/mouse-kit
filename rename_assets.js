import fs from "fs";
import path from "path";

const assetsDir = "d:\\my-own\\mouse-web\\assets";

const landingSrc = path.join(assetsDir, "image copy.png");
const dashboardSrc = path.join(assetsDir, "image.png");

const landingDest = path.join(assetsDir, "landing-hero.png");
const dashboardDest = path.join(assetsDir, "dashboard-demo.png");

if (fs.existsSync(landingSrc)) {
  fs.copyFileSync(landingSrc, landingDest);
  console.log("Copied landing-hero.png");
}

if (fs.existsSync(dashboardSrc)) {
  fs.copyFileSync(dashboardSrc, dashboardDest);
  console.log("Copied dashboard-demo.png");
}
