import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { Subject } from 'rxjs';

@Injectable()
export class EventService {
  private events$ = new Subject<any>();
  private user: User;

  publish(event: any) {
    this.events$.next(event);
  }

  subscribe(next: (value: any) => void) {
    this.events$.subscribe((event) => {
      if (event.type === 'userLoggedIn') {
        this.user = event.payload;
      }
      next(event);
    });
  }
}
