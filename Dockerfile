FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html

# Render injects $PORT at runtime; render a config that listens on it.
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV PORT=10000
EXPOSE 10000

CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
