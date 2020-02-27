# dcmq.js
you need to enable MQTT over WebSockets for your RabbitMQ installation:

rabbitmq-plugins enable rabbitmq_web_mqtt

homebrew/Cellar/rabbitmq/3.8.1/sbin/rabbitmq-plugins enable rabbitmq_web_mqtt
cp rabbitmq.conf ~/homebrew/etc/rabbitmq/
brew services restart rabbitmq
