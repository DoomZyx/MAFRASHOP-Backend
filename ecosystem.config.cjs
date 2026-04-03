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
        NODE_ENV: "production",
      },
    },
  ],
};
