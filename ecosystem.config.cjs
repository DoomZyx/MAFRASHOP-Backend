module.exports = {
  apps: [
    {
      name: "preprod",
      script: "./server.js",
      env: {
        NODE_ENV: "preprod",
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
