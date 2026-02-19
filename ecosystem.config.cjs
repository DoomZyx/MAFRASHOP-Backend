module.exports = {
  apps: [
    {
      name: "preprod",
      script: "./server.js",
      env: {
        PORT: 3000,
        NODE_ENV: "development",
      },
    },
    {
      name: "prod",
      script: "./server.js",
      env: {
        PORT: 3000,
        NODE_ENV: "production",
      },
    },
  ],
};
