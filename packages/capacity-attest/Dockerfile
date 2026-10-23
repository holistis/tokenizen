# Container voor de MCP-server, zodat een directory (zoals Glama) hem zelf kan
# starten en introspecteren zonder iets over deze monorepo te weten.
#
# WAAROM DIT BESTAAT. Zelfde reden als agent-receipt-verify's eigen Dockerfile:
# een MCP-directory start de server zelf op en doet een introspectie-aanroep
# (tools/list). Zonder dit bestand kon Glama capacity-attest niet starten, dus
# niet keuren ("this server cannot be deployed", quality "Not graded",
# 2026-10-23).
#
# Bouwt uit de lokale bron, niet vanaf npm: de registry-versie (0.8.0) loopt
# een versie achter op deze repo (0.9.0). tokenizen-net-guard en @x402/extensions
# zijn sibling-pakketten in dezelfde workspace; buiten de workspace (zoals hier,
# alleen deze map als build-context) haalt npm ze gewoon van de echte,
# gepubliceerde registry. Live getest in een losse map met precies deze stappen
# voor dit bestand geschreven werd: npm install + npm run build + een echte
# initialize/tools/list-uitwisseling over stdio, alle drie groen.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY README.md README.nl.md LICENSE ./

# Niet als root draaien, zelfde reden als agent-receipt-verify's Dockerfile.
USER node

# stdio, geen poort: een MCP-client praat over standaard in- en uitvoer.
ENTRYPOINT ["node", "dist/index.js"]
