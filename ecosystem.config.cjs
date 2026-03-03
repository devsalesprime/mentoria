module.exports = {
  apps: [{
    name: 'prosperus-mentor',
    script: './server.cjs',
    cwd: '/var/www/prosperus-mentor-diagnosis',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3005
    },
    error_file: '/var/log/prosperus-mentor-error.log',
    out_file: '/var/log/prosperus-mentor-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    time: true
  }]
};
