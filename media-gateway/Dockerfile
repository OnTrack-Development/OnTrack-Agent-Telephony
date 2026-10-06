FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        asterisk \
        python3 \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY config/ /opt/ontrack/config/
COPY scripts/ /opt/ontrack/scripts/

RUN chmod +x /opt/ontrack/scripts/*.py /opt/ontrack/scripts/entrypoint.sh \
    && mkdir -p /var/spool/asterisk/monitor /var/lib/asterisk/agi-bin

EXPOSE 5060/udp
EXPOSE 10000-20000/udp

ENTRYPOINT ["/opt/ontrack/scripts/entrypoint.sh"]
