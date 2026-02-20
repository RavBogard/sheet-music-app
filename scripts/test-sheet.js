const url = "https://docs.google.com/spreadsheets/d/19pSctdr2Mi6KHO-LPlN6RcCAH8P1bMp8hyIWMoz0434/edit?pli=1&gid=1580772210#gid=1580772210"

let fetchUrl = url
if (url.includes("docs.google.com/spreadsheets")) {
    const docMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/)
    const gidMatch = url.match(/gid=([0-9]+)/)

    if (docMatch) {
        fetchUrl = `https://docs.google.com/spreadsheets/d/${docMatch[1]}/export?format=csv`
        if (gidMatch) {
            fetchUrl += `&gid=${gidMatch[1]}`
        }
    }
}

console.log("Fetching:", fetchUrl);

fetch(fetchUrl).then(async r => {
    console.log("Status:", r.status);
    console.log("Headers:", r.headers);
    const text = await r.text();
    console.log("Response text length:", text.length);
    console.log("Preview:", text.substring(0, 200));
}).catch(console.error);
