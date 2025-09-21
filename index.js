app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code || code.length < 10) {
    return res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Código OAuth2 no recibido</h2>
        <p>Discord no envió el parámetro <code>code</code>. Esta ruta requiere redirección desde el login.</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · verificación fallida</p>
      </section>
    `);
  }

  try {
    const data = new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: process.env.REDIRECT_URI,
    });

    const tokenResponse = await axios.post('https://discord.com/api/oauth2/token', data.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const accessToken = tokenResponse.data.access_token;

    // 🔁 Redirigir al render institucional con token
    res.redirect(`/?token=${accessToken}`);
  } catch (err) {
    res.send(`
      <section style="font-family:sans-serif; background:#1c1c1c; color:#ff4444; padding:30px; text-align:center;">
        <h2>❌ Error al procesar el código OAuth2</h2>
        <p>${err.response?.data?.error || 'Error desconocido'}</p>
        <p style="margin-top:10px; color:#888;">Sistema Abyssus · sesión fallida</p>
      </section>
    `);
  }
});










