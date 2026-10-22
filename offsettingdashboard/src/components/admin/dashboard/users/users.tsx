import { Form, Input, Select } from 'antd'
import { isSso } from '../../../../lib/auth/session'
import { FC, useEffect, useState } from 'react'
import { UserPlus, Power } from 'lucide-react'
import { motion } from 'framer-motion'
import { ERoles, EUserStatus } from '../../../../config/constant'
import handleAPIRequests from '../../../../helpers/handleApiRequest'
import { useWindowSize } from '../../../../helpers/interfaceSize'
import {
  AccountUser,
  toogleAccountDto,
  useAddNewUserMutation,
  useGetAllUsersQuery,
  useToogleActivationMutation,
} from '../../../../lib/api/admin/adminEndpoints'
import { SignupDTO } from '../../../../lib/api/Auth/authEndpoints'
import CustomButton from '../../../common/button/button'
import CustomModal from '../../../common/modal/customModal'
import Paginator from '../../../common/paginator/paginator'
import AddNewUserForm from '../../../forms/addUser'
import ToogleActivationForm from '../../../forms/toogleActivation'
import UsersTable from '../../../tables/usersTable'

interface FormPropsValues {
  status: string
}
interface NewUserFormPropsValues {
  email: string
}

const Users: FC = () => {
  const [form] = Form.useForm()
  const [userForm] = Form.useForm()

  const [toogle, { isLoading }] = useToogleActivationMutation()
  const [addUser, { isLoading: isAddingUser }] = useAddNewUserMutation()

  const [currentPage, setCurrentPage] = useState<number>(0)
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([])
  const [selectedRows, setSelectedRows] = useState<AccountUser[]>([])
  const [open, setOpen] = useState<boolean>(false)
  const [userModalOpen, setUserModalOpen] = useState<boolean>(false)
  const [status, setStatus] = useState<EUserStatus>(EUserStatus.ENABLED)
  const [name, setName] = useState<string>('')
  const [email, setEmail] = useState<string>('')

  const size = 10

  const { data, isFetching, refetch } = useGetAllUsersQuery({
    status,
    email,
    name,
    page: currentPage.toString(),
    size: size.toString(),
  })

  const onChangeStatus = (status: EUserStatus) => {
    setStatus(status)
    setCurrentPage(0)
  }

  const onChangeEmail = (email: string) => {
    setEmail(email)
    setCurrentPage(0)
  }

  const onChangeName = (name: string) => {
    setName(name)
    setCurrentPage(0)
  }
  useEffect(() => {
    refetch()
  }, [refetch])

  const options = [
    { value: EUserStatus.ENABLED, label: 'Enabled' },
    { value: EUserStatus.DISABLED, label: 'Disabled' },
  ]

  const handleRowSelection = (
    selectedKeys: React.Key[],
    selectedRows: AccountUser[]
  ) => {
    setSelectedRowKeys(selectedKeys)
    setSelectedRows(selectedRows)
  }

  const resetTableSelection = () => {
    setSelectedRowKeys([])
    setSelectedRows([])
  }

  const handleCancel = () => {
    resetTableSelection()
    setOpen(false)
    form.resetFields()
  }

  const handleCancelAddUser = () => {
    setUserModalOpen(false)
    userForm.resetFields()
  }

  const onFinish = (values: FormPropsValues) => {
    const userIds: Array<string> = selectedRows.map((row) => row.id)
    const data: toogleAccountDto = {
      status: values.status,
      userIds,
    }
    handleAPIRequests({
      request: toogle,
      ...data,
      notify: true,
      message: `${selectedRowKeys.length} ${
        selectedRowKeys.length === 1
          ? 'account'
          : selectedRowKeys.length > 1
          ? 'accounts'
          : null
      } status changed successfully `,
      onSuccess: handleCancel,
    })
  }

  const onUserFinish = (values: NewUserFormPropsValues) => {
    const data: SignupDTO = {
      ...values,
      role: ERoles.USER,
    }
    handleAPIRequests({
      request: addUser,
      ...data,
      onSuccess: handleCancelAddUser,
      notify: true,
      message: isSso ? 'Account prepared: create the same e-mail in Keycloak' : 'User added successfully',
    })
  }

  const { width } = useWindowSize()

  return (
    <>
      <CustomModal
        isVisible={open}
        setIsVisible={setOpen}
        title={`Account modification`}
        width={width <= 500 ? 500 : 1000}
        handleCancel={handleCancel}
        footerContent={
          <CustomButton
            htmlType='submit'
            form='toogle-status'
            
            loading={isLoading}
            variant='primary'
          >
            Save
          </CustomButton>
        }
      >
        <h2 className='font-semibold mb-10' style={{ color: 'var(--text-primary)' }}>
          <span>Activate or Deactivate </span>
          <span className='pl-2'>{selectedRowKeys.length}</span>
          <span className='pl-2'>
            {selectedRowKeys.length === 1
              ? 'account'
              : selectedRowKeys.length > 1
              ? 'accounts'
              : null}
          </span>
          <span className='pl-2'>selected</span>
        </h2>
        <ToogleActivationForm onFinish={onFinish} form={form} />
      </CustomModal>
      <CustomModal
        isVisible={userModalOpen}
        setIsVisible={setUserModalOpen}
        title={isSso ? 'Prepare a user (single sign-on)' : 'Register new user'}
        width={width <= 500 ? 500 : 1000}
        handleCancel={handleCancelAddUser}
        footerContent={
          <CustomButton
            htmlType='submit'
            form='add-user-form'
            
            loading={isAddingUser}
            variant='primary'
          >
            Save
          </CustomButton>
        }
      >
        {isSso && (
          <div className='mb-4 rounded-lg border border-line bg-panel-2 px-4 py-3 text-[13px] leading-relaxed text-fg-2'>
            <p className='font-medium text-fg'>People sign in with single sign-on. Create the person in Keycloak:</p>
            <ol className='ml-5 mt-1 list-decimal space-y-0.5'>
              <li>auth.carbonoz.com → realm <b>CARBONOZ</b> → Users → Add user</li>
              <li>Enter the e-mail and switch <b>Email verified</b> on, then Create</li>
              <li>Credentials → Set password with <b>Temporary</b> on (they choose their own at first sign-in)</li>
            </ol>
            <p className='mt-2'>Saving the same e-mail here prepares the Carbonoz account, so you can add them to a customer now. No password is created or e-mailed here.</p>
          </div>
        )}
        <AddNewUserForm form={userForm} onFinish={onUserFinish} />
      </CustomModal>
      <div className='w-[100%]'>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className='overflow-hidden rounded-xl border border-line bg-panel shadow-card'
        >
          <div className='flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3.5'>
            <h2 className='text-[15px] font-semibold tracking-[-0.01em] text-fg'>
              {data?.data.totalItems} Users
            </h2>
            <CustomButton
              htmlType='button'
              icon={<UserPlus size={18} />}
              onClick={() => setUserModalOpen(true)}
              variant='primary'
              
            >
              Add User
            </CustomButton>
          </div>
          <div className='p-4'>
            <div className='mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4'>
              <div>
                <label className='mb-1 block text-[12px] font-medium text-muted'>
                  Filter by status
                </label>
                <Select
                  value={status}
                  onChange={(value) => onChangeStatus(value as EUserStatus)}
                  className='w-full'
                  options={options}
                  defaultValue={'active'}
                />
              </div>
              <div>
                <label className='mb-1 block text-[12px] font-medium text-muted'>
                  Filter by Email
                </label>
                <Input
                  value={email}
                  type='text'
                  placeholder='Email'
                  className='w-full'
                  onChange={(e) => onChangeEmail(e.target.value)}
                />
              </div>
              <div>
                <label className='mb-1 block text-[12px] font-medium text-muted'>
                  Filter by Name
                </label>
                <Input
                  value={name}
                  type='text'
                  placeholder='Name'
                  className='w-full'
                  onChange={(e) => onChangeName(e.target.value)}
                />
              </div>
            </div>
            {selectedRowKeys.length > 0 && (
              <div className='mb-4'>
                <CustomButton
                  htmlType='button'
                  icon={<Power size={18} />}
                  
                  onClick={() => setOpen(true)}
                  variant='primary'
                >
                  Deactivate or Activate
                  <span className='pl-2'>
                    {selectedRowKeys.length === 1
                      ? 'account'
                      : selectedRowKeys.length > 1
                      ? 'accounts'
                      : null}
                  </span>
                </CustomButton>
              </div>
            )}
            <UsersTable
              data={data?.data.items}
              isFetching={isFetching}
              rowSelectionEnabled={true}
              onRowSelectionChange={handleRowSelection}
              selectedRowKeys={selectedRowKeys}
              key={selectedRowKeys.length}
            />
            <Paginator
              total={data?.data.totalItems}
              setCurrentPage={setCurrentPage}
              totalPages={data?.data.totalPages}
              currentPage={currentPage}
              pageSize={size}
            />
          </div>
        </motion.div>
      </div>
    </>
  )
}

export default Users
