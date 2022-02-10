FROM nginx:stable
COPY ./certs/localhost /etc/ssl/localhost
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
