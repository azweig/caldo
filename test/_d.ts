import { World } from "../src/world"
for(const [v,sys] of [[0.3,"capitalista"],[0.35,"socialista"]] as any){
const w=new World(2,0,{startEra:0,religions:[],violence:v,psychopathy:0.02,gov:"república",system:sys})
for(let d=0;d<14000;d++) w.step()
console.log(`${sys}: pob ${w.creatures.filter(c=>!c.isAvatar).length} era ${w.era} · pois ${w.pois.length}`)
}
