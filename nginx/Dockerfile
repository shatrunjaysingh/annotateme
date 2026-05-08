FROM nginx:1.25-alpine
# nginx processes *.template files in /etc/nginx/templates/ at startup via envsubst
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
