const express = require("express");
const fs = require("fs");
const router = express.Router();

// ================= FORM ROUTE =================
router.get("/", (req, res) => {
  res.send(`
  <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
    </head>
    <body>
      <h1>CONCRETE MIX</h1>
      <form action="/concrete/submit" method="POST">
        <label for="concreteVolume">Volume in m³</label>
        <input type="number" name="concreteVolume" placeholder="Volume in m³" required>

        <label for="concreteRatio">Mix Ratio</label>
        <input type="text" name="concreteRatio" placeholder="1:2:4" required>

        <label for="cement">Cement description</label>
        <input type="text" name="cement" placeholder="Bamburi Cement" required>

        <label for="cementPrice">Price of cement per bag</label>
        <input type="number" name="cementPrice" placeholder="850" required>

        <label for="sand">Sand description</label>
        <input type="text" name="sand" placeholder="River Sand" required>

        <label for="sandPrice">Price of sand per ton</label>
        <input type="number" name="sandPrice" placeholder="1350" required>

        <label for="ballast">Ballast brand</label>
        <input type="text" name="ballast" placeholder="Mazeras Ballast" required>

        <label for="ballastPrice">Price of ballast per ton</label>
        <input type="number" name="ballastPrice" placeholder="2500" required>

        <label for="laborPrice">Labor percentage of materials</label>
        <input type="number" name="laborPrice" placeholder="40" required>

        <input type="submit" value="Calculate">
      </form>
    </body>
  </html>
  `);
});

// ================= SUBMIT ROUTE =================
router.post("/submit", (req, res) => {
  const {
    concreteVolume,
    concreteRatio,
    cement,
    cementPrice,
    sand,
    sandPrice,
    ballast,
    ballastPrice,
    laborPrice
  } = req.body;

  // Convert inputs
  let volume = parseFloat(concreteVolume);
  let cemPrice = parseFloat(cementPrice);
  let sanPrice = parseFloat(sandPrice);
  let balPrice = parseFloat(ballastPrice);
  let labor = parseFloat(laborPrice);

  // Mix calculations
  let dryVol = volume * 1.54;
  let ratios = concreteRatio.split(":");
  let cemPro = parseFloat(ratios[0]);
  let sanPro = parseFloat(ratios[1]);
  let balPro = parseFloat(ratios[2]);
  let comSum = cemPro + sanPro + balPro;

  let cemVol = (cemPro * dryVol) / comSum;
  let sanVol = (sanPro * dryVol) / comSum;
  let balVol = (balPro * dryVol) / comSum;

  let cemWeight = cemVol * 1448;
  let sanWeight = sanVol * 1600;
  let balWeight = balVol * 2000;

  let cemQty = Math.ceil(cemWeight / 50);
  let sanQty = Math.ceil(sanWeight / 1000);
  let balQty = Math.ceil(balWeight / 1000);

  let cemCost = cemPrice * cemQty;
  let sanCost = sanPrice * sanQty;
  let balCost = balPrice * balQty;

  let conMatCost = cemCost + sanCost + balCost;
  let labCost = (labor * conMatCost) / 100;
  let conCost = conMatCost + labCost;

  // Descriptions
  let cemdes = `${cement} ... ${cemQty} bags ... ${cemPrice} ... ${cemCost}`;
  let sandes = `${sand} ... ${sanQty} tons ... ${sanPrice} ... ${sanCost}`;
  let baldes = `${ballast} ... ${balQty} tons ... ${balPrice} ... ${balCost}`;
  let matdes = `materials ... ${conMatCost}`;
  let labdes = `labor ... ${labCost}`;
  let condes = `subtotal ... ${conCost}`;

  // Save data to file
  let dataToSave = `Volume: ${concreteVolume} m³
Ratio: ${concreteRatio}
Materials:
${cemdes}
${sandes}
${baldes}
${matdes}
${labdes}
${condes}\n\n`;

  fs.appendFile("materials.txt", dataToSave, (err) => {
    if (err) console.error("Error writing to file:", err);
    else console.log("Concrete data saved to materials.txt");
  });

  // Send response
  res.send(`
    <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <h1>CONCRETE MIX DATA</h1>
        <p>Volume: ${concreteVolume} m³</p>
        <p>Ratio: ${concreteRatio}</p>
        <h2>Materials</h2>
        <ul>
          <li>${cemdes}</li>
          <li>${sandes}</li>
          <li>${baldes}</li>
          <li>${matdes}</li>
          <li>${labdes}</li>
          <li>${condes}</li>
        </ul>
        <p>Concrete data saved in materials.txt</p>
        <a href="/concrete">Go Back</a>
      </body>
    </html>
  `);
});

// ✅ Export router
module.exports = router;
