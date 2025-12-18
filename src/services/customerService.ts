import { Customer, CieloTerminal } from '../types';
import { hashPassword, verifyPassword } from '../utils/encryption';
import { supabase } from '../lib/supabase';

// Função para migrar cliente antigo (com cieloTerminalId) para novo formato (com cieloTerminals)
const migrateCustomer = (customer: Customer): Customer => {
  if (customer.cieloTerminalId && (!customer.cieloTerminals || customer.cieloTerminals.length === 0)) {
    const terminal: CieloTerminal = {
      id: `term_${customer.id}_${Date.now()}`,
      terminalId: customer.cieloTerminalId,
      name: `Conta ${customer.name}`,
      createdAt: new Date().toISOString(),
    };
    return {
      ...customer,
      cieloTerminals: [terminal],
      cieloTerminalId: undefined, // Remover campo antigo após migração
    };
  }
  return customer;
};

// Converter dados do banco para formato Customer
const dbToCustomer = (dbCustomer: any, terminals: CieloTerminal[] = []): Customer => {
  return {
    id: dbCustomer.id,
    name: dbCustomer.name,
    email: dbCustomer.email || '',
    phone: dbCustomer.phone || '',
    cpfCnpj: dbCustomer.cpf_cnpj || '',
    region: dbCustomer.region || '',
    totalPurchases: dbCustomer.total_purchases || 0,
    lastPurchase: dbCustomer.last_purchase || new Date().toISOString().split('T')[0],
    status: dbCustomer.status || 'active',
    category: dbCustomer.category || '',
    username: dbCustomer.username || '',
    cieloTerminals: terminals,
  };
};

// Converter Customer para formato do banco
const customerToDb = (customer: Customer) => {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email || null,
    phone: customer.phone || null,
    cpf_cnpj: customer.cpfCnpj || null,
    region: customer.region || null,
    total_purchases: customer.totalPurchases || 0,
    last_purchase: customer.lastPurchase || null,
    status: customer.status || 'active',
    category: customer.category || null,
    username: customer.username || null,
  };
};

export const getCustomers = async (): Promise<Customer[]> => {
  try {
    // Buscar clientes
    const { data: customersData, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (customersError) {
      console.error('Erro ao buscar clientes do Supabase:', customersError);
      return [];
    }

    // Buscar terminais
    const { data: terminalsData, error: terminalsError } = await supabase
      .from('cielo_terminals')
      .select('*');

    if (terminalsError) {
      console.error('Erro ao buscar terminais do Supabase:', terminalsError);
    }

    // Agrupar terminais por cliente
    const terminalsByCustomer: { [key: string]: CieloTerminal[] } = {};
    if (terminalsData) {
      terminalsData.forEach((term: any) => {
        if (!terminalsByCustomer[term.customer_id]) {
          terminalsByCustomer[term.customer_id] = [];
        }
        terminalsByCustomer[term.customer_id].push({
          id: term.id,
          terminalId: term.terminal_id,
          name: term.name || `Terminal ${term.terminal_id}`,
          createdAt: term.created_at,
        });
      });
    }

    // Converter e migrar clientes
    return customersData.map((customer: any) => {
      const terminals = terminalsByCustomer[customer.id] || [];
      return migrateCustomer(dbToCustomer(customer, terminals));
    });
  } catch (error) {
    console.error('Erro inesperado ao buscar clientes:', error);
    return [];
  }
};

export const getCustomerById = async (id: string): Promise<Customer | null> => {
  try {
    // Buscar cliente
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (customerError || !customerData) {
      console.error('Erro ao buscar cliente do Supabase:', customerError);
      return null;
    }

    // Buscar terminais do cliente
    const { data: terminalsData, error: terminalsError } = await supabase
      .from('cielo_terminals')
      .select('*')
      .eq('customer_id', id);

    if (terminalsError) {
      console.error('Erro ao buscar terminais do Supabase:', terminalsError);
    }

    const terminals: CieloTerminal[] = (terminalsData || []).map((term: any) => ({
      id: term.id,
      terminalId: term.terminal_id,
      name: term.name || `Terminal ${term.terminal_id}`,
      createdAt: term.created_at,
    }));

    return migrateCustomer(dbToCustomer(customerData, terminals));
  } catch (error) {
    console.error('Erro inesperado ao buscar cliente:', error);
    return null;
  }
};

// Função para obter todas as contas de todos os clientes
export const getAllTerminals = async (): Promise<CieloTerminal[]> => {
  try {
    const { data, error } = await supabase
      .from('cielo_terminals')
      .select('*');

    if (error) {
      console.error('Erro ao buscar terminais do Supabase:', error);
      return [];
    }

    return (data || []).map((term: any) => ({
      id: term.id,
      terminalId: term.terminal_id,
      name: term.name || `Terminal ${term.terminal_id}`,
      createdAt: term.created_at,
    }));
  } catch (error) {
    console.error('Erro inesperado ao buscar terminais:', error);
    return [];
  }
};

// Função para obter cliente por terminal ID
export const getCustomerByTerminalId = async (terminalId: string): Promise<Customer | null> => {
  try {
    // Buscar terminal
    const { data: terminalData, error: terminalError } = await supabase
      .from('cielo_terminals')
      .select('*, customers(*)')
      .eq('terminal_id', terminalId)
      .single();

    if (terminalError || !terminalData) {
      return null;
    }

    const customerData = terminalData.customers;
    if (!customerData) {
      return null;
    }

    // Buscar todos os terminais do cliente
    const { data: terminalsData } = await supabase
      .from('cielo_terminals')
      .select('*')
      .eq('customer_id', customerData.id);

    const terminals: CieloTerminal[] = (terminalsData || []).map((term: any) => ({
      id: term.id,
      terminalId: term.terminal_id,
      name: term.name || `Terminal ${term.terminal_id}`,
      createdAt: term.created_at,
    }));

    return migrateCustomer(dbToCustomer(customerData, terminals));
  } catch (error) {
    console.error('Erro inesperado ao buscar cliente por terminal:', error);
    return null;
  }
};

export const updateCustomer = async (
  id: string,
  updates: Partial<Customer>,
  password?: string
): Promise<Customer | null> => {
  try {
    // Buscar cliente atual
    const currentCustomer = await getCustomerById(id);
    if (!currentCustomer) {
      return null;
    }

    // Atualizar dados do cliente
    const updatedCustomer = { ...currentCustomer, ...updates };
    const dbData = customerToDb(updatedCustomer);

    const { error: updateError } = await supabase
      .from('customers')
      .update(dbData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Erro ao atualizar cliente no Supabase:', updateError);
      return null;
    }

    // Atualizar senha se fornecida
    if (password) {
      const hashedPassword = await hashPassword(password);
      const { error: passwordError } = await supabase
        .from('customer_passwords')
        .upsert({
          customer_id: id,
          password_hash: hashedPassword,
          updated_at: new Date().toISOString(),
        });

      if (passwordError) {
        console.error('Erro ao atualizar senha do cliente no Supabase:', passwordError);
      }
    }

    // Atualizar terminais se fornecidos
    if (updates.cieloTerminals) {
      // Remover terminais antigos
      await supabase
        .from('cielo_terminals')
        .delete()
        .eq('customer_id', id);

      // Inserir novos terminais
      if (updates.cieloTerminals.length > 0) {
        const terminalsToInsert = updates.cieloTerminals.map(term => ({
          id: term.id,
          customer_id: id,
          terminal_id: term.terminalId,
          name: term.name || `Terminal ${term.terminalId}`,
        }));

        const { error: terminalsError } = await supabase
          .from('cielo_terminals')
          .insert(terminalsToInsert);

        if (terminalsError) {
          console.error('Erro ao atualizar terminais no Supabase:', terminalsError);
        }
      }
    }

    // Sincronizar: atualizar usuário correspondente
    try {
      // Buscar usuário associado a este cliente
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('customer_id', id)
        .maybeSingle();

      if (userData) {
        // Atualizar dados do usuário diretamente no Supabase
        const userUpdates: any = {};
        if (updates.name !== undefined) userUpdates.name = updates.name;
        if (updates.email !== undefined) userUpdates.email = updates.email;
        
        if (Object.keys(userUpdates).length > 0) {
          await supabase
            .from('users')
            .update(userUpdates)
            .eq('id', userData.id);
          
          console.log('Usuário sincronizado atualizado para o cliente:', id);
        }
      }
    } catch (syncError) {
      // Não bloquear atualização do cliente se houver erro na sincronização
      console.error('Erro ao sincronizar usuário para cliente:', syncError);
    }

    return await getCustomerById(id);
  } catch (error) {
    console.error('Erro inesperado ao atualizar cliente:', error);
    return null;
  }
};

// Função para obter hash da senha do cliente
export const getCustomerPasswordHash = async (customerId: string): Promise<string | undefined> => {
  try {
    const { data, error } = await supabase
      .from('customer_passwords')
      .select('password_hash')
      .eq('customer_id', customerId)
      .maybeSingle();

    if (error) {
      if (error.code !== 'PGRST116') {
        console.error('Erro ao buscar hash da senha:', error);
      }
      return undefined;
    }

    if (!data) {
      return undefined;
    }

    return data.password_hash;
  } catch (error) {
    console.error('Erro ao buscar hash da senha:', error);
    return undefined;
  }
};

// Função para verificar senha do cliente
export const verifyCustomerPassword = async (
  customerId: string,
  password: string
): Promise<boolean> => {
  try {
    const hash = await getCustomerPasswordHash(customerId);
    if (!hash) return false;
    return verifyPassword(password, hash);
  } catch (error) {
    console.error('Erro ao verificar senha do cliente:', error);
    return false;
  }
};

// Mantido para compatibilidade (deprecated - usar verifyCustomerPassword)
export const getCustomerPassword = (_customerId: string): string | undefined => {
  console.warn('getCustomerPassword está deprecated. Use verifyCustomerPassword.');
  return undefined;
};

export const createCustomer = async (
  customer: Omit<Customer, 'id' | 'totalPurchases' | 'lastPurchase'> & Partial<Pick<Customer, 'totalPurchases' | 'lastPurchase'>>,
  password?: string
): Promise<Customer> => {
  try {
    // Gerar ID único
    const newId = `c${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Migrar cieloTerminalId para cieloTerminals se necessário
    let cieloTerminals = customer.cieloTerminals || [];
    if (customer.cieloTerminalId && cieloTerminals.length === 0) {
      cieloTerminals = [{
        id: `term_${Date.now()}`,
        terminalId: customer.cieloTerminalId,
        name: `Conta ${customer.name}`,
        createdAt: new Date().toISOString(),
      }];
    }

    const newCustomer: Customer = {
      ...customer,
      id: newId,
      totalPurchases: customer.totalPurchases ?? 0,
      lastPurchase: customer.lastPurchase ?? new Date().toISOString().split('T')[0],
      cieloTerminals,
      cieloTerminalId: undefined,
    };

    const dbData = customerToDb(newCustomer);

    // Criar cliente
    const { error: customerError } = await supabase
      .from('customers')
      .insert(dbData)
      .select()
      .single();

    if (customerError) {
      console.error('Erro ao criar cliente no Supabase:', customerError);
      throw customerError;
    }

    // Criar senha se fornecida
    if (password) {
      const hashedPassword = await hashPassword(password);
      const { error: passwordError } = await supabase
        .from('customer_passwords')
        .insert({
          customer_id: newId,
          password_hash: hashedPassword,
        });

      if (passwordError) {
        console.error('Erro ao criar senha do cliente no Supabase:', passwordError);
        // Tentar reverter criação do cliente
        await supabase.from('customers').delete().eq('id', newId);
        throw passwordError;
      }
    }

    // Criar terminais se houver
    if (cieloTerminals.length > 0) {
      const terminalsToInsert = cieloTerminals.map(term => ({
        id: term.id,
        customer_id: newId,
        terminal_id: term.terminalId,
        name: term.name || `Terminal ${term.terminalId}`,
      }));

      const { error: terminalsError } = await supabase
        .from('cielo_terminals')
        .insert(terminalsToInsert);

      if (terminalsError) {
        console.error('Erro ao criar terminais no Supabase:', terminalsError);
      }
    }

    // Sincronizar: criar usuário correspondente se não existir
    try {
      if (customer.email) {
        // Verificar se já existe usuário com este email
        const { data: existingUser } = await supabase
          .from('users')
          .select('*')
          .eq('email', customer.email)
          .maybeSingle();
        
        if (!existingUser) {
          // Criar usuário correspondente com role 'customer'
          const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const hashedPassword = password ? await hashPassword(password) : await hashPassword('123456');
          
          // Criar usuário diretamente no Supabase para evitar dependência circular
          const { error: userError } = await supabase
            .from('users')
            .insert({
              id: userId,
              name: customer.name,
              email: customer.email,
              role: 'customer',
              customer_id: newId,
            });
          
          if (!userError) {
            // Criar senha do usuário
            await supabase
              .from('user_passwords')
              .insert({
                user_id: userId,
                password_hash: hashedPassword,
              });
            
            console.log('Usuário sincronizado criado para o cliente:', newId);
          }
        } else if (existingUser.role === 'customer' && !existingUser.customer_id) {
          // Se usuário existe mas não tem customer_id, atualizar
          await supabase
            .from('users')
            .update({ customer_id: newId })
            .eq('id', existingUser.id);
          
          console.log('Usuário sincronizado atualizado para o cliente:', newId);
        }
      }
    } catch (syncError) {
      // Não bloquear criação do cliente se houver erro na sincronização
      console.error('Erro ao sincronizar usuário para cliente:', syncError);
    }

    return await getCustomerById(newId) || newCustomer;
  } catch (error) {
    console.error('Erro inesperado ao criar cliente:', error);
    throw error;
  }
};

export const deleteCustomer = async (id: string): Promise<boolean> => {
  try {
    // Sincronizar: deletar usuário correspondente primeiro
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('customer_id', id)
        .maybeSingle();

      if (userData) {
        // Deletar usuário diretamente no Supabase para evitar dependência circular
        await supabase
          .from('users')
          .delete()
          .eq('id', userData.id);
        
        console.log('Usuário sincronizado deletado para o cliente:', id);
      }
    } catch (syncError) {
      // Não bloquear deleção do cliente se houver erro na sincronização
      console.error('Erro ao sincronizar deleção de usuário:', syncError);
    }

    // Deletar cliente (cascata vai deletar senhas e terminais)
    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Erro ao deletar cliente do Supabase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Erro inesperado ao deletar cliente:', error);
    return false;
  }
};
