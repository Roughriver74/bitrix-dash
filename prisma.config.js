const { defineConfig } = require('@prisma/config');

module.exports = defineConfig({
  prisma: {
    schema: 'prisma/schema.prisma',
  },
  datasource: {
    url: 'file:./dev.db',
  },
});
