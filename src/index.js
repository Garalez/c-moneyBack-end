const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

let userData = null;

app.get('/userData', (req, res) => {
  if (userData === null) {
    res.status(404).json({ message: 'User data not found' });
    return;
  }
  res.json(userData);
});

app.post('/userData', (req, res) => {
  const { data } = req.body;
  if (!data) {
    res.status(400).json({ message: 'Missing data in request body' });
    return;
  }
  userData = data;
  res.json({ message: 'User data updated' });
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
