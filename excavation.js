// excavation.js - Corrected version
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
      <h1>EXCAVATION CALCULATOR</h1>
      <form action="/excavation/submit" method="POST">
        <label for="excavationVolume">Volume in m³</label>
        <input type="number" name="excavationVolume" placeholder="Volume in m³" required>

        <label for="excavationRate">Rate per m³</label>
        <input type="number" name="excavationRate" placeholder="500" required>

        <label for="laborPrice">Labor percentage</label>
        <input type="number" name="laborPrice" placeholder="40" required>

        <input type="submit" value="Calculate">
      </form>
    </body>
  </html>
  `);
});

router.post("/submit", (req, res) => {
  const { excavationVolume, excavationRate, laborPrice } = req.body;

  let volume = parseFloat(excavationVolume);
  let rate = parseFloat(excavationRate);
  let labor = parseFloat(laborPrice);

  let excavationCost = volume * rate;
  let labCost = (labor * excavationCost) / 100;
  let totalCost = excavationCost + labCost;

  let dataToSave = `Excavation ... ${volume} m³ ... ${rate} ... ${excavationCost}\nLabor ... ${labCost}\nTotal ... ${totalCost}\n\n`;

  fs.appendFile("materials.txt", dataToSave, (err) => {
    if (err) console.error("Error writing to file:", err);
    else console.log("Excavation data saved to materials.txt");
  });

  res.send(`
    <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <h1>EXCAVATION DATA</h1>
        <p>Volume: ${volume} m³</p>
        <p>Rate: ${rate} per m³</p>
        <h2>Cost Breakdown</h2>
        <ul>
          <li>Excavation Cost: ${excavationCost}</li>
          <li>Labor: ${labCost}</li>
          <li>Total: ${totalCost}</li>
        </ul>
        <a href="/excavation">Go Back</a>
      </body>
    </html>
  `);
});

module.exports = router;
