import * as React from 'react';
import { render } from '@testing-library/react';
import {
  interpret,
  assign,
  createMachine,
  ActorRefFrom,
  spawnMachine
} from 'xstate';
import { useService, useMachine, useActor } from '../src';

describe('useService', () => {
  it('should accept spawned machine', () => {
    interface TodoCtx {
      completed: boolean;
    }
    interface TodosCtx {
      todos: Array<ActorRefFrom<typeof todoMachine>>;
    }

    const todoMachine = createMachine<TodoCtx>({
      context: {
        completed: false
      },
      initial: 'uncompleted',
      states: {
        uncompleted: {
          on: {
            COMPLETE: 'done'
          }
        },
        done: {
          entry: assign<TodoCtx>({ completed: true })
        }
      }
    });

    const todosMachine = createMachine<TodosCtx, { type: 'CREATE' }>({
      context: { todos: [] },
      initial: 'working',
      states: { working: {} },
      on: {
        CREATE: {
          actions: assign((ctx) => ({
            ...ctx,
            todos: [...ctx.todos, spawnMachine(todoMachine)]
          }))
        }
      }
    });

    const service = interpret(todosMachine).start();

    const Todo = ({ index }: { index: number }) => {
      const [current] = useService(service);
      const todoRef = current.context.todos[index];
      const [todoCurrent] = useActor(todoRef);
      return <>{todoCurrent.context.completed}</>;
    };

    service.send('CREATE');

    render(<Todo index={0} />);
  });
});

describe('useMachine', () => {
  interface YesNoContext {
    value?: number;
  }

  interface YesNoEvent {
    type: 'YES';
  }

  const yesNoMachine = createMachine<YesNoContext, YesNoEvent>({
    context: {
      value: undefined
    },
    initial: 'no',
    states: {
      no: {
        on: {
          YES: 'yes'
        }
      },
      yes: {
        type: 'final'
      }
    }
  });

  it('state should not become never after checking state with matches', () => {
    const YesNo = () => {
      const [state] = useMachine(yesNoMachine);

      if (state.matches('no')) {
        return <span>No</span>;
      }

      return <span>Yes: {state.context.value}</span>;
    };

    render(<YesNo />);
  });

  // Example from: https://github.com/statelyai/xstate/discussions/1534
  it('spawned actors should be typed correctly', () => {
    const child = createMachine<{ bar: number }, { type: 'FOO'; data: number }>(
      {
        id: 'myActor',
        context: {
          bar: 1
        },
        initial: 'ready',
        states: {
          ready: {}
        }
      }
    );

    const m = createMachine<{ actor: ActorRefFrom<typeof child> | null }>(
      {
        initial: 'ready',
        context: {
          actor: null
        },
        states: {
          ready: {
            entry: 'spawnActor'
          }
        }
      },
      {
        actions: {
          spawnActor: assign({
            actor: () => spawnMachine(child)
          })
        }
      }
    );

    interface Props {
      myActor: ActorRefFrom<typeof child>;
    }

    function Element({ myActor }: Props) {
      const [current, send] = useActor(myActor);
      const bar: number = current.context.bar;

      // @ts-expect-error
      send({ type: 'WHATEVER' });

      return (
        <>
          {bar}
          <div onClick={() => send({ type: 'FOO', data: 1 })}>click</div>
        </>
      );
    }

    function App() {
      const [current] = useMachine(m);

      if (!current.context.actor) {
        return null;
      }

      return <Element myActor={current.context.actor} />;
    }

    const noop = (_val: any) => {
      /* ... */
    };

    noop(App);
  });
});
