import { extractPack } from "@foundryvtt/foundryvtt-cli";
import fs from "node:fs";
for (const p of ["monsters","items","spells","journals"]) {
  const t=`/tmp/_chk_${p}`; fs.rmSync(t,{recursive:true,force:true}); fs.mkdirSync(t,{recursive:true});
  await extractPack(`packs/${p}`, t, {log:false});
  console.log(`   ${p}: ${fs.readdirSync(t).filter(f=>f.endsWith(".json")).length} docs OK`);
}
