sleep 15
svcs=$(curl -fsS "$TVH/api/mpegts/service/grid?limit=50" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.stringify(JSON.parse(s).entries.map(e=>e.uuid))))")
curl -fsS "$TVH/api/service/mapper/save" --data-urlencode "node={\"services\":$svcs,\"encrypted\":false,\"merge_same_name\":false,\"check_availability\":false,\"type_tags\":false,\"provider_tags\":false,\"network_tags\":false}"; echo
sleep 3
curl -fsS "$TVH/api/channel/grid?limit=50" | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',async()=>{
  const m=await import('$HERE/content.mjs')
  const muxNames=JSON.parse(require('child_process').execSync('curl -fsS \"$TVH/api/mpegts/service/grid?limit=50\"')).entries
  for (const ch of JSON.parse(s).entries) {
    const svc=muxNames.find(x=>ch.services.includes(x.uuid))
    const c=m.CHANNELS.find(x=>x.name===svc.multiplex)
    console.log(JSON.stringify({uuid:ch.uuid,name:c.name,number:c.number}))
  }
})" | while read -r node; do curl -fsS "$TVH/api/idnode/save" --data-urlencode "node=$node" </dev/null; echo " $node"; done
