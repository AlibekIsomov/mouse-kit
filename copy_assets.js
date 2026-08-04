import fs from "fs";
import path from "path";

const src1 = "C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\ab989e4a-24e6-4ce7-a3c3-bad6d27dcd85\\hero_landing_1785847556794.png";
const src2 = "C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\ab989e4a-24e6-4ce7-a3c3-bad6d27dcd85\\demo_dashboard_loaded_1785847968175.png";

const destDir = "d:\\my-own\\mouse-web\\assets";
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

if (fs.existsSync(src1)) fs.copyFileSync(src1, path.join(destDir, "landing-hero.png"));
if (fs.existsSync(src2)) fs.copyFileSync(src2, path.join(destDir, "dashboard-demo.png"));

console.log("Assets copied successfully!");
