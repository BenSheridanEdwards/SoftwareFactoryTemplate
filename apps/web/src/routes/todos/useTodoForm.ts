import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Schema } from 'effect';
import { useForm } from 'react-hook-form';
import { todoFormSchema } from './todoFormSchema';

/** A title form that starts at `title` and submits the normalised title. */
export function useTodoForm(title: string) {
  return useForm({
    resolver: standardSchemaResolver(Schema.toStandardSchemaV1(todoFormSchema)),
    defaultValues: { title },
  });
}
