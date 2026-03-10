module.exports = {
  apps: [
    {
      name: 'api-demandas',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'America/Bahia',
      },
    },
  ],
};
