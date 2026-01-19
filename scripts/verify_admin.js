const axios = require('axios');
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let up = false;
  for (let i = 0; i < 20; i++) {
    try {
      await axios.get('http://localhost:3005/health');
      up = true;
      break;
    } catch (e) {
      await sleep(300);
    }
  }

  if (!up) {
    console.error('server not up');
    process.exit(1);
  }

  const login = await axios.post(
    'http://localhost:3005/auth/admin-login',
    { email: 'admin@salesprime.com.br', password: '1L/0_C%pAY5u' },
    { headers: { 'Content-Type': 'application/json' } }
  );

  console.log('LOGIN', login.data);
  const token = login.data.token;

  const list = await axios.get('http://localhost:3005/api/admin/users', {
    headers: { Authorization: 'Bearer ' + token }
  });

  console.log('USERS_COUNT', list.data.total || (list.data.users && list.data.users.length));

  if (list.data.users && list.data.users.length) {
    const uid = list.data.users[0].id;
    const det = await axios.get(`http://localhost:3005/api/admin/users/${uid}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('DETAIL', det.data.user);
  }
})().catch((e) => {
  console.error(e.response ? e.response.data : e.message);
  process.exit(1);
});
