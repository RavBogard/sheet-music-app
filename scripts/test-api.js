const { default: fetch } = require('node-fetch');

async function test() {
    const res = await fetch("http://localhost:3000/api/library/list?all=true&collection=all&limit=5000");
    const json = await res.json();
    console.log(`Status: ${res.status}`);
    if (json.files) {
         console.log(`Total returned: ${json.files.length}`);
         const shireinu = json.files.filter(f => f.collection === 'supplemental');
         const core = json.files.filter(f => f.collection !== 'supplemental');
         console.log(`Shireinu: ${shireinu.length}, Core: ${core.length}`);
    } else {
         console.log(json);
    }
}
test().catch(console.error);
