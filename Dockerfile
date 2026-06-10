# --- Stage 1: build Angular ---------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /src/weddingWeb

COPY weddingWeb/package.json weddingWeb/package-lock.json ./
RUN npm ci

COPY weddingWeb/ ./
RUN npm run build -- --configuration production

# --- Stage 2: build ASP.NET ---------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
WORKDIR /src

COPY wedding/wedding.csproj wedding/
RUN dotnet restore wedding/wedding.csproj

COPY wedding/ wedding/
RUN dotnet publish wedding/wedding.csproj -c Release -o /app/publish /p:UseAppHost=false

# --- Stage 3: runtime ---------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app

# libgssapi-krb5-2 is probed by Npgsql at startup; installing it silences the
# "Cannot load library libgssapi_krb5.so.2" warning. Auth still uses SCRAM.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=api-build /app/publish ./
# Angular build output goes into wwwroot so UseStaticFiles() / fallback can serve it.
COPY --from=web-build /src/weddingWeb/dist/weddingWeb/browser ./wwwroot

# Render injects $PORT; bind ASP.NET Core to it at container start.
ENV PORT=10000
EXPOSE 10000

ENTRYPOINT ["/bin/sh", "-c", "ASPNETCORE_URLS=http://+:${PORT} exec dotnet wedding.dll"]

