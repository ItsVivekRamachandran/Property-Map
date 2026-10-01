FROM python:3.12-slim
WORKDIR /app
COPY server.py seed.py ./
COPY public ./public
RUN useradd --uid 10001 --create-home appuser && mkdir -p /data && chown appuser:appuser /data
USER appuser
ENV PROPERTY_MAP_MODE=shared PROPERTY_MAP_DATA=/data PROPERTY_MAP_SECURE_COOKIE=1
EXPOSE 8000
VOLUME ["/data"]
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000"]
