const express = require('express');
const router = express.Router();

router.get('/informacion', async (req, res) => {
    res.render('informacion/index');
});

module.exports = router;