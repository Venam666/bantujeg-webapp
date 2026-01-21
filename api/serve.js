const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
    // SEKARANG BACA template.html
    const filePath = path.join(process.cwd(), 'template.html');

    try {
        // Cek dulu filenya ada gak
        if (!fs.existsSync(filePath)) {
            console.error("❌ File template.html gak ketemu di:", filePath);
            return res.status(404).send("Error: Template file not found.");
        }

        let content = fs.readFileSync(filePath, 'utf8');

        // Suntik Key (Pake Fallback string kosong biar gak error kalau key belum diset)
        const googleKey = process.env.GOOGLE_MAPS_API_KEY || '';
        const firebaseKey = process.env.FIREBASE_API_KEY || '';

        content = content.replace('__GOOGLE_KEY__', googleKey);
        content = content.replace('__FIREBASE_KEY__', firebaseKey);

        res.setHeader('Content-Type', 'text/html');
        res.status(200).send(content);

    } catch (error) {
        console.error("❌ Error Server:", error);
        res.status(500).send("Internal Server Error: Gagal memproses template.");
    }
};