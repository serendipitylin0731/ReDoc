import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
for (const directory of ["cmaps", "standard_fonts"]) {
  const destination = `${root}public/pdfjs/${directory}`;
  mkdirSync(destination, { recursive: true });
  cpSync(`${root}node_modules/pdfjs-dist/${directory}`, destination, { recursive: true });
}
