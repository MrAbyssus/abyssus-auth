app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code || typeof code !== 'string' || code.length < 10) {
    return res.status(400).send(`<section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
      <h2>❌ Código OAuth2 no recibido</h2>
      <p>Discord no envió el parámetro <code>code</code> o está incompleto.</p>
    </section>`);
  }

  try {
    // Validar variables de entorno
    const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env;
    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      throw new Error('❌ Variables de entorno OAuth2 no definidas');
    }

    // Intercambiar code por access_token
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI.trim(),
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // Redirigir al dashboard con token en query
    res.redirect(`/?token=${accessToken}`);
  } catch (error) {
    const errorMsg = error.response?.data?.error_description || error.message || 'Error desconocido';
    res.status(400).send(`<section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
      <h2>❌ Error al procesar el código OAuth2</h2>
      <p>${errorMsg}</p>
    </section>`);
  }
});




























