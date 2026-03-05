module.exports = {
  apps: [{
    name: 'prosperus',
    script: './server.cjs',
    cwd: '/var/www/prosperus-mentor-diagnosis',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
      // All secrets loaded from .env — never hardcode here
    },
    error_file: '/var/log/prosperus-error.log',
    out_file: '/var/log/prosperus-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    time: true
  }]
};
