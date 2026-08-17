import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type PromptOptions = {
  title?: string;
  description?: string;
  label?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  required?: boolean;
};

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | {
      kind: 'prompt';
      options: PromptOptions;
      resolve: (v: string | null) => void;
    }
  | null;

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  prompt: (
    label: string,
    defaultValue?: string,
    options?: Omit<PromptOptions, 'label'>
  ) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const [value, setValue] = useState('');

  const confirm = useCallback((options: ConfirmOptions | string) => {
    const opts = typeof options === 'string' ? { description: options } : options;
    return new Promise<boolean>(resolve => {
      setState({ kind: 'confirm', options: opts, resolve });
    });
  }, []);

  const prompt = useCallback(
    (
      label: string,
      defaultValue = '',
      options: Omit<PromptOptions, 'label'> = {}
    ) => {
      setValue(defaultValue);
      return new Promise<string | null>(resolve => {
        setState({ kind: 'prompt', options: { ...options, label }, resolve });
      });
    },
    []
  );

  const close = useCallback(
    (result: boolean | string | null) => {
      setState(current => {
        current?.resolve(result as never);
        return null;
      });
    },
    []
  );

  const canConfirmPrompt =
    state?.kind === 'prompt' ? !state.options.required || value.trim() : true;

  return (
    <ConfirmContext.Provider value={{ confirm, prompt }}>
      {children}
      <Dialog
        open={Boolean(state)}
        onOpenChange={next => {
          if (!next) close(state?.kind === 'confirm' ? false : null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {state ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {state.options.title ||
                    (state.kind === 'confirm' ? 'Are you sure?' : 'Enter details')}
                </DialogTitle>
                {state.options.description ? (
                  <DialogDescription>{state.options.description}</DialogDescription>
                ) : null}
              </DialogHeader>
              {state.kind === 'prompt' ? (
                <div className="space-y-2">
                  {state.options.label ? <Label>{state.options.label}</Label> : null}
                  <Input
                    autoFocus
                    value={value}
                    placeholder={state.options.placeholder}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && canConfirmPrompt) {
                        close(value);
                      }
                    }}
                  />
                </div>
              ) : null}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => close(state.kind === 'confirm' ? false : null)}
                >
                  {state.options.cancelLabel || 'Cancel'}
                </Button>
                <Button
                  variant={
                    state.kind === 'confirm' && state.options.danger
                      ? 'destructive'
                      : 'default'
                  }
                  disabled={state.kind === 'prompt' && !canConfirmPrompt}
                  onClick={() => close(state.kind === 'confirm' ? true : value)}
                >
                  {state.options.confirmLabel ||
                    (state.kind === 'confirm' ? 'Confirm' : 'Save')}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirmDialog() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  }
  return ctx;
}
