const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
    // Cari file index.html di folder luar
    const filePath = path.join(process.cwd(), 'index.html');
    
    try {
        let content = fs.readFileSync(filePath, 'utf8');

        // Suntik Key dari Vercel Environment Variable ke Placeholder
        // Pastikan nama variabel ENV di Vercel SAMA PERSIS kayak di sini
        content = content.replace('__GOOGLE_KEY__', process.env.GOOGLE_MAPS_API_KEY);
        content = content.replace('__FIREBASE_KEY__', process.env.FIREBASE_API_KEY);

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(content);
    } catch (error) {
        console.error("Gagal baca index.html:", error);
        res.status(500).send("Error Internal Server: File HTML tidak ditemukan.");
    }
};