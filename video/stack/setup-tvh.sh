#!/usr/bin/env bash
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
TVH=${TVH:-http://127.0.0.1:19981}
net=$(curl -fsS "$TVH/api/mpegts/network/create" --data-urlencode class=iptv_network \
  --data-urlencode 'conf={"enabled":true,"networkname":"Demo IPTV","max_streams":0,"skipinitscan":false,"idlescan":false,"service_sid":0}' | sed 's/.*"uuid":"\([^"]*\)".*/\1/')
echo "network $net"
node -e "import('$HERE/content.mjs').then(m=>m.CHANNELS.forEach(c=>console.log(c.id.split('.')[0], c.number, c.name)))" | while read -r slug num name; do
  url="pipe:///usr/bin/ffmpeg -loglevel fatal -re -stream_loop -1 -i /clips/${slug}.ts -c copy -f mpegts pipe:1"
  conf=$(node -e "console.log(JSON.stringify({enabled:1,iptv_url:process.argv[1],iptv_muxname:process.argv[2],channel_number:Number(process.argv[3]),iptv_sname:process.argv[2],scan_state:0}))" "$url" "$name" "$num")
  curl -fsS "$TVH/api/mpegts/network/mux_create" --data-urlencode "uuid=$net" --data-urlencode "conf=$conf" </dev/null; echo " mux $name"
done
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
