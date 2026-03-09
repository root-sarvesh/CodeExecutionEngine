FROM debian:bullseye-slim


RUN apt-get update && \
    apt-get install -y python3 g++ default-jdk && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*


RUN useradd -m -s /bin/bash sandbox_user


WORKDIR /code


USER sandbox_user

CMD ["bash"]