FROM golang:1.20

# Get git
RUN apt-get update \
    && apt-get -y install apt-utils curl git \
    && apt-get clean && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /appserver

# Populate the rest of the source
COPY . .


# Build and install unmatched-online
RUN go build

ENTRYPOINT ["./gameserver"]

EXPOSE 1111
