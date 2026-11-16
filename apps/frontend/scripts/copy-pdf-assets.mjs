import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const root=path.dirname(require.resolve('pdfjs-dist/package.json'));
const destination=new URL('../public/pdfjs-assets/',import.meta.url);
fs.mkdirSync(destination,{recursive:true});
for(const name of ['standard_fonts','cmaps','wasm'])fs.cpSync(path.join(root,name),new URL(name+'/',destination),{recursive:true});
fs.copyFileSync(path.join(root,'LICENSE'),new URL('LICENSE',destination));
