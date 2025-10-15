const express = require("express");
const fs = require("fs");
const router = express.Router();

router.get("/", (req, res) => {
  res.send(`
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <h1>WALLING</h1>
      <form action="/walling/submit" method="POST">
        <label for="wallArea">Area in m²</label>
        <input type="number" name="wallArea" placeholder="Area in m²" required>

        <label for="blockSize">Size of building block in mm</label>
        <input type="text" name="blockSize" placeholder="360x180x180" required>

        <label for="blockPrice">Price of block per piece</label>
        <input type="number" name="blockPrice" placeholder="75" required>

        <label for="mortaRatio">Mortar ratio</label>
        <input type="text" name="mortaRatio" placeholder="1:3" required>

        <label for="cement">Cement description</label>
        <input type="text" name="cement" placeholder="Bamburi Cement" required>

        <label for="cementPrice">Price of cement per bag</label>
        <input type="number" name="cementPrice" placeholder="850" required>

        <label for="sand">Sand description</label>
        <input type="text" name="sand" placeholder="River Sand" required>

        <label for="sandPrice">Price of sand per ton</label>
        <input type="number" name="sandPrice" placeholder="1350" required>

        <label for="laborPrice">Labor percentage of materials</label>
        <input type="number" name="laborPrice" placeholder="40" required>

        <input type="submit" value="Calculate">
      </form>
    </body>
    </html>
  `);
});

router.post("/submit", (req, res) => {
  const {
    wallArea,
    blockSize,
    blockPrice,
    mortaRatio,
    cement,
    cementPrice,
    sand,
    sandPrice,
    laborPrice
  } = req.body;

  let area = parseFloat(wallArea);
  let bloprice = parseFloat(blockPrice);
  let blosize = blockSize.toLowerCase();
  let blodims = blosize.split("x");

  let blockLength = parseFloat(blodims[0]) / 1000;
  let blockThickness = parseFloat(blodims[1]) / 1000;
  let blockHeight = parseFloat(blodims[2]) / 1000;

  let length = blockLength + 0.02;
  let height = blockHeight + 0.02;
  let blockArea = length * height;

  let bloQty = Math.ceil(area / blockArea);
  let bloCost = bloQty * bloprice;

  let blocksVolume = bloQty * blockLength * blockThickness * blockHeight;
  let wallVolume = area * blockThickness;
  let volume = wallVolume - blocksVolume;

  let cemPrice = parseFloat(cementPrice);
  let sanPrice = parseFloat(sandPrice);
  let labor = parseFloat(laborPrice);

  let dryVol = volume * 1.33;
  let ratios = mortaRatio.split(":");
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

  let conMatCost = cemCost + sanCost + bloCost;
  let labCost = (labor * conMatCost) / 100;
  let conCost = conMatCost + labCost;

  let blodes = `${blockSize} blocks ... ${bloQty} pcs ... ${bloprice} ... ${bloCost}`;
  let cemdes = `${cement.toLowerCase()} ... ${cemQty} bags ... ${cemPrice} ... ${cemCost}`;
  let sandes = `${sand.toLowerCase()} ... ${sanQty} tons ... ${sanPrice} ... ${sanCost}`;
  let matdes = `materials ... ${conMatCost}`;
  let labdes = `labor ... ${labCost}`;
  let condes = `subtotal ... ${conCost}`;

  let dataToSave = `Area: ${wallArea} m²
Ratio: ${mortaRatio}
Materials:
${blodes}
${cemdes}
${sandes}
${matdes}
${labdes}
${condes}\n\n`;

  fs.appendFile("materials.txt", dataToSave, (err) => {
    if (err) console.error("Error writing to file:", err);
    else console.log("Walling data saved to materials.txt");
  });
  res.send(`
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <h1>WALLING DATA</h1>
      <p>Area: ${wallArea} m²</p>
      <p>Ratio: ${mortaRatio}</p>
      <h2>Materials</h2>
      <ul>
        <li>${blodes}</li>
        <li>${cemdes}</li>
        <li>${sandes}</li>
        <li>${matdes}</li>
        <li>${labdes}</li>
        <li>${condes}</li>
      </ul>
      <p>Walling data saved in materials.txt</p>
      <a href="/walling">Go Back</a>
    </body>
    </html>
  `);
});

module.exports = router;
