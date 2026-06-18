import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const src = process.argv[2];
const dest = process.argv[3] || path.join(path.dirname(src), "_extracted");
fs.mkdirSync(dest, { recursive: true });
execSync(`tar -xf "${src}" -C "${dest}"`, { stdio: "inherit" });
const xml = fs.readFileSync(path.join(dest, "word/document.xml"), "utf8");
const text = xml
  .replace(/<w:tab[^>]*\/>/g, "\t")
  .replace(/<w:br[^>]*\/>/g, "\n")
  .replace(/<\/w:p>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");
console.log(text);
