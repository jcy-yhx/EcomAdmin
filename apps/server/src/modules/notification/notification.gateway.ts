import { WebSocketGateway, WebSocketServer, OnGatewayConnection, SubscribeMessage } from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  /** Push a notification to a specific user by userId */
  sendNotification(userId: number, data: { title: string; content: string; type?: string }) {
    this.server.emit(`notification:${userId}`, data);
  }

  /** Join user to their private room for targeted push */
  @SubscribeMessage('join')
  handleJoin(client: Socket, userId: number) {
    client.join(`user:${userId}`);
  }
}
