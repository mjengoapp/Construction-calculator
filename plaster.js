// plaster.js
const express = require("express");
const fs = require("fs");
const router = express.Router();

router.use(express.urlencoded({ extended: true }));
router.use(express.static(__dirname));

// GET plaster form
router.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <h1>PLASTER MIX</h1>
      <a href="/">home</a>
      <form action="/plaster/submit" method="POST">
        <label for="plasterArea">area in m²</label>
        <input type="number" name="plasterArea" placeholder="Area in m²">
        <label for="plasterThickness">Thickness in mm</label>
        <input type="number" name="plasterThickness" placeholder="Thickness in mm">
        <label for="plasterRatio">ratio</label>
        <input type="text" name="plasterRatio" placeholder="1:3">
        <label for="cement">cement description</label>
        <input type="text" name="cement" placeholder="bamburi cement">
        <label for="cementPrice">price of cement per bag</label>
        <input type="number" name="cementPrice" placeholder="850">
        <label for="sand">sand description</label>
        <input type="text" name="sand" placeholder="River Sand">
        <label for="sandPrice">price of sand per ton</label>
        <input type="number" name="sandPrice" placeholder="1350">
        <label for="laborPrice">labor percentage of materials</label>
        <input type="number" name="laborPrice" placeholder="40">
        <input type="submit">
      </form>
    </body>
    </html>
  `);
});

// POST plaster results
router.post("/submit", (req, res) => {
  const {
    plasterArea,
    plasterThickness,
    plasterRatio,
    cement,
    cementPrice,
    sand,
    sandPrice,
    laborPrice,
  } = req.body;

  let area = parseFloat(plasterArea);
  let thickness = parseFloat(plasterThickness) / 1000;
  let volume = area * thickness;
  let cemPrice = parseFloat(cementPrice);
  let sanPrice = parseFloat(sandPrice);
  let labor = parseFloat(laborPrice);

  let dryVol = volume * 1.33;
  let ratios = plasterRatio.split(":");
  let cemPro = parseFloat(ratios[0]);
  let sanPro = parseFloat(ratios[1]);
  let comSum = cemPro + sanPro;
  let cemVol = (cemPro * dryVol) / comSum;
  let sanVol = (sanPro * dryVol) / comSum;

  let cemWeight = cemVol * 1448;
  let sanWeight = sanVol * 1600;

  let cemQty = Math.ceil(cemWeight / 50);
  let sanQty = Math.ceil(sanWeight / 1000);

  let cemCost = cemPrice * cemQty;
  let sanCost = sanPrice * sanQty;

  let conMatCost = cemCost + sanCost;
  let labCost = (labor * conMatCost) / 100;
  let conCost = conMatCost + labCost;
  let cemdes = `${cement} ... ${cemQty} ... bags ... ${cemPrice} ... ${cemCost}`;
  let sandes = `${sand} ... ${sanQty} ... tons ... ${sanPrice} ... ${sanCost}`;
  let matdes = `materials ... ${conMatCost}`;
  let labdes = `labor ... ${labCost}`;
  let condes = `subtotal ... ${conCost}`;
  let dataToSave = `Area: ${plasterArea} m² ... Thickness: ${plasterThickness}mm\nRatio: ${plasterRatio}\nMaterials:\n${cemdes}\n${sandes}\n${matdes}\n${labdes}\n${condes}\n\n\n`;

  fs.appendFile("materials.txt", dataToSave, (err) => {
    if (err) console.error("Error writing to file:", err);
    else console.log("plaster data saved to materials.txt");
  });

  res.send(`
    <html>
    <head><link rel="stylesheet" href="/styles.css"></head>
    <body>
      <h1>PLASTER DATA</h1>
      <p>volume:${plasterArea}m² thickness: ${plasterThickness}mm</p>
      <p>ratio:${plasterRatio}</p>
      <h2>Materials</h2>
      <ul>
        <li>${cemdes}</li>
        <li>${sandes}</li>
        <li>${matdes}</li>
        <li>${labdes}</li>
        <li>${condes}</li>
      </ul>
      <p>plaster data saved in materials.txt</p>
      <a href="/">go back</a>
    </body>
    </html>
  `);
});

module.exports = router;
